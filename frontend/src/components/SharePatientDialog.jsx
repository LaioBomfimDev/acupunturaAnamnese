import { useMemo, useRef, useState } from 'react';
import { DISCIPLINE_IDS, getDiscipline } from '../data/disciplines';
import { OPTIONAL_SHARE_SCOPES } from '../data/shareScopes';
import { createRecordShare } from '../services/recordSharesService';

// ============================================================
// Diálogo "Enviar para outro profissional" (Fase 3)
// Plano: docs/plano-clinica-multidisciplinar.md
//
// Escolhe disciplina de origem/destino + O QUE compartilhar (escopos;
// cadastro pré-setado e travado) + nota de encaminhamento, e exige
// CONFIRMAÇÃO DE SENHA antes de enviar (ação sensível).
//
// O envio: garante a matrícula no destino + cria o record_share. Não
// copia dados — cria a autorização de leitura.
// ============================================================

export function SharePatientDialog({ patient, onClose, onDone }) {
  const enrolledDisciplines = useMemo(
    () => (patient.enrollments || []).map(e => e.discipline).filter(id => DISCIPLINE_IDS.includes(id)),
    [patient.enrollments],
  );

  const [fromDiscipline, setFromDiscipline] = useState(enrolledDisciplines[0] || 'acupuntura');
  const [toDiscipline, setToDiscipline] = useState('');
  const [scopes, setScopes] = useState(() => OPTIONAL_SHARE_SCOPES.map(s => s.id)); // por padrão, tudo marcado
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKeyRef = useRef(null);

  const toOptions = DISCIPLINE_IDS.filter(id => id !== fromDiscipline);

  function toggleScope(id) {
    setScopes(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!toDiscipline) {
      setError('Escolha a disciplina de destino.');
      return;
    }
    if (!password) {
      setError('Confirme sua senha para enviar.');
      return;
    }

    setSubmitting(true);
    try {
      idempotencyKeyRef.current ||= crypto.randomUUID();

      await createRecordShare(patient.id, {
        fromDiscipline,
        toDiscipline,
        scopes,
        note: note.trim() || null,
        password,
        idempotencyKey: idempotencyKeyRef.current,
      });

      onDone?.({
        toLabel: getDiscipline(toDiscipline)?.label,
        fromLabel: getDiscipline(fromDiscipline)?.label,
      });
    } catch (err) {
      setError(err.message || 'Não foi possível enviar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="share-overlay" role="dialog" aria-modal="true" aria-label={`Enviar ${patient.name}`}>
      <form className="share-dialog" onSubmit={handleSubmit}>
        <div className="share-dialog-head">
          <b>Enviar {patient.name} para outro profissional</b>
          <button type="button" className="share-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <p className="small">
          O profissional de destino passa a ler os itens que você marcar. Nada é copiado; o envio é
          registrado, revogável e exige sua senha.
        </p>

        <div className="share-row">
          <label>
            De (origem dos dados)
            <select value={fromDiscipline} onChange={e => { setFromDiscipline(e.target.value); setToDiscipline(''); }}>
              {(enrolledDisciplines.length ? enrolledDisciplines : DISCIPLINE_IDS).map(id => (
                <option key={id} value={id}>{getDiscipline(id)?.label}</option>
              ))}
            </select>
          </label>
          <label>
            Para (destino)
            <select value={toDiscipline} onChange={e => setToDiscipline(e.target.value)}>
              <option value="">Escolha…</option>
              {toOptions.map(id => (
                <option key={id} value={id}>{getDiscipline(id)?.label}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="share-scopes">
          <legend>O que compartilhar</legend>
          <label className="share-scope share-scope-locked">
            <input type="checkbox" checked disabled />
            <span>
              <b>Cadastro do paciente</b>
              <small>Sempre incluído.</small>
            </span>
          </label>
          {OPTIONAL_SHARE_SCOPES.map(scope => (
            <label key={scope.id} className="share-scope">
              <input
                type="checkbox"
                checked={scopes.includes(scope.id)}
                onChange={() => toggleScope(scope.id)}
              />
              <span>
                <b>{scope.label}</b>
                <small>{scope.description}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="share-note">
          Nota de encaminhamento (opcional)
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Motivo do encaminhamento…" />
        </label>

        <label className="share-password">
          Confirme sua senha para enviar
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        </label>

        {error && <div className="alert">{error}</div>}

        <div className="share-actions">
          <button type="button" className="tag" onClick={onClose} disabled={submitting}>Cancelar</button>
          <button type="submit" className="tag active" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Confirmar envio'}
          </button>
        </div>
      </form>
    </div>
  );
}
