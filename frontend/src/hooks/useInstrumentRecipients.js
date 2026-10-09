import { useCallback, useEffect, useState } from 'react';
import { getInstrumentResultRecipients } from '../services/patientInstrumentService';
import { recipientPlan } from '../utils/instrumentRecipients';

// ============================================================
// Quem recebe o resultado das escalas de um paciente numa área
// (utils/instrumentRecipients.js). Recarrega com reload() depois de um
// envio que trocou o responsável. Enquanto recarrega o mesmo paciente e
// a mesma área, mostra o que já tinha, sem piscar.
// ============================================================

export function useInstrumentRecipients(patientId, discipline) {
  const [token, setToken] = useState(0);
  const scope = `${patientId}|${discipline}`;
  const key = `${scope}|${token}`;
  const [result, setResult] = useState({ key: null, scope: null, info: null, error: '' });

  useEffect(() => {
    if (!patientId || !discipline) return undefined;
    let cancelled = false;
    getInstrumentResultRecipients({ patientId, discipline })
      .then(info => { if (!cancelled) setResult({ key, scope, info, error: '' }); })
      .catch(err => { if (!cancelled) setResult({ key, scope, info: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [patientId, discipline, key, scope]);

  const reload = useCallback(() => setToken(current => current + 1), []);
  const sameScope = result.scope === scope;

  return {
    info: sameScope ? result.info : null,
    error: result.key === key ? result.error : '',
    loading: result.key !== key,
    // Muda quando chega uma resposta nova: a escolha da tela recomeça dela.
    version: sameScope ? result.key : null,
    reload,
  };
}

/**
 * A escolha do responsável na tela de envio. Recomeça do que o banco
 * devolveu (responsável atual ou a única pessoa na Agenda) a cada leitura
 * nova; o que a pessoa marcou vale até a próxima leitura.
 */
export function useRecipientChoice(recipients, discipline) {
  const [picked, setPicked] = useState({ version: null, value: '' });
  const initial = recipientPlan(recipients.info, '', { discipline }).initialChoice;
  const value = recipients.version !== null && picked.version === recipients.version ? picked.value : initial;
  const plan = recipientPlan(recipients.info, value, { discipline });
  let canSend = false;
  // Sem a leitura (banco antigo ou falha), quem decide é o banco no envio.
  if (recipients.error) canSend = true;
  else if (recipients.info) canSend = plan.canSend;
  return {
    plan,
    value,
    setValue: next => setPicked({ version: recipients.version, value: next }),
    canSend,
    responsibleId: plan.canChoose ? value || null : null,
  };
}

export default useInstrumentRecipients;
