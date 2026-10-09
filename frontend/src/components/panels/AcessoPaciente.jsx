import { useEffect, useState } from 'react';
import { getClinicPortalPolicy, setClinicPortalPolicy } from '../../services/patientPortalService';

// ============================================================
// Configurações → Acesso do paciente (só a administração).
//
// Decide quem gera e vê o código que o paciente usa para entrar na
// Área do Paciente: só a administração (padrão) ou também quem atende o
// paciente. "Quem atende" é a mesma regra das escalas, conferida no banco
// (can_manage_patient_access); aqui só se grava a escolha. Liberar ou
// bloquear o acesso de um paciente continua na ficha dele, com a
// administração.
// ============================================================

const OPTIONS = [
  {
    allowed: false,
    title: 'Só a administração',
    help: 'Quem atende envia a escala, mas pede à administração a mensagem com o código.',
  },
  {
    allowed: true,
    title: 'A administração e quem atende o paciente',
    help: 'Depois de enviar uma escala, quem atende já vê o código e a mensagem pronta para mandar.',
  },
];

export function AcessoPaciente({ profile }) {
  const clinicId = profile?.clinic_id || null;
  const [allowed, setAllowed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    getClinicPortalPolicy(clinicId)
      .then(policy => { if (!cancelled) setAllowed(policy.professionalsManageAccess); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clinicId]);

  async function choose(next) {
    if (saving || next === allowed) return;
    const previous = allowed;
    setAllowed(next);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await setClinicPortalPolicy(next);
      setNotice(next
        ? 'Salvo. Quem atende o paciente passa a ver o código de acesso dele.'
        : 'Salvo. Só a administração vê o código de acesso dos pacientes.');
    } catch (err) {
      setAllowed(previous);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="gt-empty">Carregando…</p>;

  return (
    <section className="gt-custom">
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      {notice && <div className="gt-notice gt-notice-success" role="status">{notice}</div>}

      {allowed !== null && (
        <div className="gt-custom-grid">
          <article className="gt-custom-card">
            <header>
              <h3>Código de acesso do paciente</h3>
              <span>{allowed ? 'Equipe que atende' : 'Só a administração'}</span>
            </header>
            <p className="gt-custom-help">
              O paciente entra na Área do Paciente com este código e a data de nascimento do cadastro.
            </p>
            <fieldset className="gt-accent-policy" disabled={saving}>
              <legend>Quem gera e vê o código</legend>
              {OPTIONS.map(option => (
                <label
                  key={String(option.allowed)}
                  className={`gt-accent-policy-option${allowed === option.allowed ? ' selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="portal-access-policy"
                    checked={allowed === option.allowed}
                    onChange={() => choose(option.allowed)}
                  />
                  <span>
                    <b>{option.title}</b>
                    <small>{option.help}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="gt-custom-help">
              Trocar o código, desativar ou liberar o acesso de um paciente continua com a administração, na ficha dele.
            </p>
          </article>
        </div>
      )}
    </section>
  );
}

export default AcessoPaciente;
