import { useEffect, useMemo, useRef, useState } from 'react';
import { DISCIPLINE_IDS, getDiscipline } from '../data/disciplines';
import { OPTIONAL_SHARE_SCOPES } from '../data/shareScopes';
import { createRecordShare } from '../services/recordSharesService';
import { listClinicMembers, shortName } from '../services/clinicMembersService';

// ============================================================
// Diálogo "Enviar para outro profissional" (Fase 3)
// Plano: docs/plano-clinica-multidisciplinar.md
//
// Escolhe disciplina de origem + O QUE compartilhar (escopos;
// cadastro pré-setado e travado) + nota de encaminhamento, e exige
// CONFIRMAÇÃO DE SENHA antes de enviar (ação sensível).
//
// O destino é um PROFISSIONAL específico, não a disciplina inteira:
// compartilhar por disciplina significava que qualquer colega ativo
// naquela área lia o prontuário, mesmo sem ser quem ia atender o
// caso — ruim para privacidade. O passo "Para" busca a equipe da
// instituição (listClinicMembers) e lista cada profissional
// habilitado na disciplina de destino; a escolha grava quem
// especificamente recebe (to_user_id), e é só essa pessoa que o
// banco autoriza a ler depois.
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
  const [toUserId, setToUserId] = useState('');
  const [scopes, setScopes] = useState(() => OPTIONAL_SHARE_SCOPES.map(s => s.id)); // por padrão, tudo marcado
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState(null); // null = ainda carregando/indisponível
  const idempotencyKeyRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    listClinicMembers()
      .then(list => { if (!cancelled) setMembers(list); })
      .catch(() => { if (!cancelled) setMembers([]); }); // equipe é só um complemento visual — não trava o envio
    return () => { cancelled = true; };
  }, []);

  const toOptions = DISCIPLINE_IDS.filter(id => id !== fromDiscipline);

  const peopleByDiscipline = useMemo(() => {
    const map = new Map();
    for (const id of toOptions) map.set(id, []);
    for (const member of members || []) {
      if (member.is_active === false) continue;
      for (const disciplineId of member.disciplines || []) {
        if (map.has(disciplineId)) map.get(disciplineId).push(member);
      }
    }
    return map;
  }, [members, toOptions]);

  function chooseTarget(disciplineId, memberId) {
    setToDiscipline(disciplineId);
    setToUserId(memberId);
  }

  function toggleScope(id) {
    setScopes(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);

    if (!toUserId) {
      setError('Escolha o profissional que vai receber o paciente.');
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
        toUserId,
        scopes,
        note: note.trim() || null,
        password,
        idempotencyKey: idempotencyKeyRef.current,
      });

      const person = (members || []).find(m => m.id === toUserId);
      onDone?.({
        toLabel: person ? shortName(person.full_name) : getDiscipline(toDiscipline)?.label,
        fromLabel: getDiscipline(fromDiscipline)?.label,
      });
    } catch (err) {
      setError(err.message || 'Não foi possível enviar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" role="dialog" aria-modal="true" aria-label={`Enviar ${patient.name}`}>
      <form className="cp-modal-panel" onSubmit={handleSubmit}>
        <div className="cp-modal-head">
          <h3 className="cp-modal-title">Enviar {patient.name}</h3>
          <button type="button" className="cp-modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="cp-modal-body">
          <p className="cp-modal-intro">
            O profissional de destino passa a ler os itens que você marcar. Nada é copiado; o envio é
            registrado, revogável e exige sua senha.
          </p>

          <label className="cps-field">
            <span className="cps-label">De (origem dos dados)</span>
            <select
              className="cp-select"
              value={fromDiscipline}
              onChange={e => { setFromDiscipline(e.target.value); setToDiscipline(''); setToUserId(''); }}
            >
              {(enrolledDisciplines.length ? enrolledDisciplines : DISCIPLINE_IDS).map(id => (
                <option key={id} value={id}>{getDiscipline(id)?.label}</option>
              ))}
            </select>
          </label>

          <div className="cps-field">
            <span className="cps-label">Para (o profissional que vai receber)</span>
            <div className="cps-team">
              {members === null && <p className="cp-empty">Carregando equipe…</p>}
              {members !== null && toOptions.every(id => (peopleByDiscipline.get(id) || []).length === 0) && (
                <p className="cp-empty">Nenhum profissional ativo em outra área ainda.</p>
              )}
              {toOptions.map(id => {
                const people = peopleByDiscipline.get(id) || [];
                if (members !== null && people.length === 0) return null;
                return (
                  <div key={id} className="cps-team-group">
                    <span className="cps-team-discipline">{getDiscipline(id)?.label}</span>
                    {people.map(person => (
                      <button
                        key={person.id}
                        type="button"
                        className="cps-team-option"
                        aria-pressed={toUserId === person.id && toDiscipline === id}
                        onClick={() => chooseTarget(id, person.id)}
                      >
                        <span className="cps-team-people">{shortName(person.full_name)}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <fieldset className="cps-scopes">
            <legend className="cps-scopes-legend">O que compartilhar</legend>
            <label className="cps-scope cps-scope-locked">
              <input type="checkbox" checked disabled />
              <span>
                <b>Cadastro do paciente</b>
                <small>Sempre incluído.</small>
              </span>
            </label>
            {OPTIONAL_SHARE_SCOPES.map(scope => (
              <label key={scope.id} className="cps-scope">
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

          <label className="cps-field">
            <span className="cps-label">Nota de encaminhamento (opcional)</span>
            <textarea
              className="cps-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="Motivo do encaminhamento…"
            />
          </label>

          <label className="cps-field">
            <span className="cps-label">Confirme sua senha para enviar</span>
            <input
              className="cps-password-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>

          {error && <div className="cp-notice cp-notice-error">{error}</div>}

          <div className="cps-actions">
            <button type="button" className="cp-btn" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="cp-btn cp-btn--primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Confirmar envio'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
