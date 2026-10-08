import { useState } from 'react';
import { SearchSelect } from '../ui/SearchSelect';
import { accessStatus, minDueDate } from '../../utils/patientForms';
import { getPatientAccess, sendPatientForm } from '../../services/patientPortalService';
import { PortalShareBox } from './PortalShareBox';

// ============================================================
// Enviar um formulário publicado a um paciente, com prazo. O banco cria
// o acesso do paciente se ainda não existir (portal_send_form); depois
// do envio aparece a mensagem pronta para o WhatsApp.
// Com `patient` fixo (ficha do paciente) não pergunta quem.
// ============================================================

export function SendFormPanel({ forms, patients = [], patient = null, clinicName, onSent }) {
  const [patientId, setPatientId] = useState(patient?.id || '');
  const [formId, setFormId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const published = forms.filter(form => form.status === 'published');
  const target = patient || patients.find(item => item.id === patientId) || null;
  const missingBirth = Boolean(target) && !target.birth_date;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!target || !formId) return;
    setSending(true);
    setError('');
    setResult(null);
    try {
      const assignmentId = await sendPatientForm({ patientId: target.id, formId, dueDate: dueDate || null });
      const access = await getPatientAccess(target.id);
      const form = published.find(item => item.id === formId);
      setResult({ patient: target, access, formTitle: form?.title || '', dueDate });
      setFormId('');
      setDueDate('');
      onSent?.(assignmentId);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (!published.length) {
    return (
      <p className="gt-empty">
        Nenhum formulário publicado ainda. Monte e publique um em Gestão → Importáveis → Formulários.
      </p>
    );
  }

  return (
    <div>
      <form className="gt-filters" onSubmit={handleSubmit}>
        {!patient && (
          <div className="gt-field gt-field--grow">
            <label htmlFor="pq-send-patient">Paciente</label>
            <SearchSelect
              id="pq-send-patient"
              value={patientId}
              onChange={value => { setPatientId(value); setResult(null); }}
              options={patients.map(item => ({ id: item.id, label: item.name, avatar: true }))}
              placeholder="Digite o nome do paciente…"
              allowEmpty={false}
            />
          </div>
        )}
        <div className="gt-field gt-field--grow">
          <label htmlFor="pq-send-form">Formulário</label>
          <SearchSelect
            id="pq-send-form"
            value={formId}
            onChange={value => { setFormId(value); setResult(null); }}
            options={published.map(form => ({ id: form.id, label: form.title }))}
            placeholder="Escolha o formulário…"
            allowEmpty={false}
          />
        </div>
        <label className="gt-field">
          Prazo (opcional)
          <input
            type="date"
            className="gt-input"
            value={dueDate}
            min={minDueDate()}
            onChange={event => setDueDate(event.target.value)}
          />
        </label>
        <button type="submit" className="gt-btn gt-btn--primary" disabled={!target || !formId || missingBirth || sending}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {missingBirth && (
        <div className="gt-notice" role="status">
          {target.name} está sem data de nascimento no cadastro. É com ela que o paciente entra na Área do Paciente:
          cadastre na ficha e envie de novo.
        </div>
      )}
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}

      {result && (
        <div className="gt-notice gt-notice-success" role="status">
          <p style={{ margin: '0 0 10px' }}>
            <b>Enviado para {result.patient.name}.</b> Agora mande a mensagem abaixo: ela leva o link com o código já preenchido.
          </p>
          {accessStatus(result.access).id !== 'active' && (
            <p className="gt-notice gt-notice-error" role="alert">
              O acesso deste paciente está “{accessStatus(result.access).label}”: ele não consegue entrar até a
              administração liberar na ficha do paciente, aba Área do Paciente.
            </p>
          )}
          <PortalShareBox
            patient={result.patient}
            clinicName={clinicName}
            accessCode={result.access?.access_code}
            formTitle={result.formTitle}
            dueDate={result.dueDate}
          />
        </div>
      )}
    </div>
  );
}

export default SendFormPanel;
